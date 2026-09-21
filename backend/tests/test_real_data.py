"""Integration tests against the real Qualisys export in data/."""
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.services import session_service as ss


def _session(real_data_dir):
    return ss.build_session(ss.discover_files(real_data_dir)["test1"])


def test_discovery(real_data_dir):
    f = ss.discover_files(real_data_dir)["test1"]
    assert f.position.name == "test1_Pos.xlsx" and f.velocity.name == "test1_Vel.xlsx"


def test_dataset_statistics(real_data_dir):
    s = _session(real_data_dir)
    assert s.frame_count == 1205
    assert (s.frames[0], s.frames[-1]) == (122, 1326)
    assert s.sample_rate == 300
    assert len(s.marker_names) == 23
    assert "ankle r" in s.marker_names and "st" in s.marker_names
    assert abs(s.duration - 4.0133) < 1e-3
    assert s.position_unit == "mm"
    assert np.allclose(s.timestamps, (s.frames - 1) / 300, atol=1e-4)  # Pos time consistent
    assert np.isfinite(s.positions).all()


def test_st_tracking_loss(real_data_dir):
    s = _session(real_data_dir)
    st = s.marker_names.index("st")
    bad = ~s.valid_positions[:, st]
    assert bad.sum() == 486
    assert s.frames[bad].min() == 841 and s.frames[bad].max() == 1326
    assert np.all(s.positions[bad, st] == 0)  # raw data untouched
    others = np.delete(s.valid_positions, st, axis=1)
    assert others.all()
    md = ss.metadata_for(s)
    assert [t.marker for t in md.trackingLoss] == ["st"]
    assert md.trackingLoss[0].ranges == [(841, 1326)]


def test_velocity_sync_and_speed(real_data_dir):
    s = _session(real_data_dir)
    assert s.has_velocity and s.velocities.shape == s.positions.shape
    assert not any("no velocity row" in w for w in s.warnings)
    ok = s.valid_velocities
    expect = np.linalg.norm(s.velocities, axis=2)
    assert np.allclose(s.speed[ok], expect[ok])
    assert np.isnan(s.speed[~ok]).all()
    assert not ok[:, s.marker_names.index("st")][-1]


def test_api_end_to_end(real_data_dir):
    c = TestClient(app)
    lst = c.get("/api/sessions").json()
    t1 = next(x for x in lst if x["id"] == "test1")
    assert t1["hasVelocity"] and t1["frameCount"] == 1205 and t1["markerCount"] == 23
    md = c.get("/api/sessions/test1").json()
    assert md["firstFrame"] == 122 and md["sampleRate"] == 300
    d = c.get("/api/sessions/test1/data").json()
    F, M = md["frameCount"], len(md["markers"])
    assert len(d["positions"]) == F * M * 3 and len(d["valid"]) == F * M
    assert len(d["velocities"]) == F * M * 3 and len(d["speed"]) == F * M
    assert c.get("/api/sessions/nope").status_code == 404
    sk = c.get("/api/skeleton").json()["connections"]
    assert all(a.strip() in md["markers"] and b.strip() in md["markers"] for a, b in sk)
