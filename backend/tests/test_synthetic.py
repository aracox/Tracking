import numpy as np

from app.services import session_service as ss
from app.services.validation import zero_run_mask
from .conftest import write_qualisys

MK = ["a ", "b"]  # note trailing space, like real exports


def rows(n, zero_from=None, nan_at=None):
    out = []
    for i in range(n):
        a = (100.0 + i, 200.0, 300.0)
        b = (10.0, 20.0, 30.0 + i)
        if zero_from is not None and i >= zero_from:
            b = (0.0, 0.0, 0.0)
        if nan_at == i:
            a = (None, None, None)
        out.append([a, b])
    return out


def test_filename_matching(tmp_path):
    names = [
        "s1_Pos.xlsx", "s1_Vel.xlsx", "s2_Pos.xlsx", "orphan_Vel.xlsx",
        "~$s3_Pos.xlsx", "notes.xlsx", "S4_pos.XLSX",
        "s1_Oqus_9_18012.mp4", "s2_Oqus_1_5.MOV", "orphan_Oqus_1_1.mp4",
    ]
    for n in names:
        (tmp_path / n).write_bytes(b"x")
    found = ss.discover_files(tmp_path)
    assert list(found) == ["S4", "s1", "s2"]  # sorted; orphan Vel/video ignored; temp files ignored
    assert found["s1"].velocity is not None and found["s2"].velocity is None
    assert found["s1"].video.name == "s1_Oqus_9_18012.mp4"
    assert found["s2"].video.name == "s2_Oqus_1_5.MOV"  # extension case-insensitive
    assert found["S4"].video is None


def test_seekable_video_preferred(tmp_path):
    write_qualisys(tmp_path / "p_Pos.xlsx", "pos", MK, rows(5))
    (tmp_path / "p_Oqus_9_18012.mp4").write_bytes(b"raw")
    (tmp_path / "p_Oqus_9_18012_seekable.mp4").write_bytes(b"seekable")
    found = ss.discover_files(tmp_path)
    assert found["p"].video.name == "p_Oqus_9_18012_seekable.mp4"  # never the raw export
    # order of discovery shouldn't matter
    (tmp_path / "p_Oqus_9_18012_seekable.mp4").unlink()
    found = ss.discover_files(tmp_path)
    assert found["p"].video.name == "p_Oqus_9_18012.mp4"  # falls back when absent


def test_parse_and_validity(tmp_path):
    write_qualisys(tmp_path / "t_Pos.xlsx", "pos", MK, rows(20, zero_from=10, nan_at=3), freq=100, first_frame=5)
    write_qualisys(tmp_path / "t_Vel.xlsx", "vel", MK, [[(3.0, 4.0, 0.0), (0.0, 0.0, 1.0)]] * 20, freq=100, first_frame=5)
    s = ss.build_session(ss.discover_files(tmp_path)["t"])
    assert s.marker_names == ["a", "b"]  # trailing space stripped
    assert s.frames[0] == 5 and s.frame_count == 20
    assert s.sample_rate == 100
    assert s.positions.shape == (20, 2, 3)
    # raw untouched: zeros stay zeros, blank is NaN
    assert np.all(s.positions[10:, 1] == 0)
    assert np.isnan(s.positions[3, 0]).all()
    # validity
    assert not s.valid_positions[3, 0] and s.valid_positions[4, 0]
    assert s.valid_positions[:10, 1].all() and not s.valid_positions[10:, 1].any()
    # velocity aligned + speed once
    assert s.has_velocity
    assert np.isclose(s.speed[0, 0], 5.0)
    assert np.isnan(s.speed[3, 0])  # invalid position => no speed
    assert np.isclose(s.speed[0, 1], 1.0) and np.isnan(s.speed[12, 1])
    md = ss.metadata_for(s)
    assert md.missingSamples == 1 + 10
    assert {t.marker for t in md.trackingLoss} == {"a", "b"}
    assert md.positionUnit == "mm"


def test_position_only_and_frame_sync(tmp_path):
    write_qualisys(tmp_path / "p_Pos.xlsx", "pos", MK, rows(10), first_frame=1)
    svc = ss.SessionService(tmp_path)
    s = svc.get("p")
    assert not s.has_velocity and s.velocities is None
    # velocity file with a shifted frame range aligns by frame number
    write_qualisys(tmp_path / "p_Vel.xlsx", "vel", MK, [[(1.0, 0.0, 0.0), (2.0, 0.0, 0.0)]] * 8, first_frame=3)
    s = ss.build_session(ss.discover_files(tmp_path)["p"])
    assert np.isnan(s.velocities[:2]).all() and np.isclose(s.velocities[2, 0, 0], 1.0)
    assert any("no velocity row" in w for w in s.warnings)


def test_video_association(tmp_path):
    write_qualisys(tmp_path / "p_Pos.xlsx", "pos", MK, rows(10), first_frame=1)
    (tmp_path / "p_Oqus_9_18012.mp4").write_bytes(b"fake-mp4")
    s = ss.build_session(ss.discover_files(tmp_path)["p"])
    assert s.has_video and s.video_file == "p_Oqus_9_18012.mp4"
    md = ss.metadata_for(s)
    assert md.hasVideo and md.videoFile == "p_Oqus_9_18012.mp4"

    svc = ss.SessionService(tmp_path)
    summ = svc.list_sessions()[0]
    assert summ.hasVideo and summ.videoFile == "p_Oqus_9_18012.mp4"


def test_short_zero_run_not_flagged():
    P = np.ones((10, 1, 3))
    P[4:6, 0] = 0  # 2 samples < default 3
    assert not zero_run_mask(P, 3).any()
    P[4:7, 0] = 0
    assert zero_run_mask(P, 3)[4:7, 0].all()


def test_cache_and_listing(tmp_path):
    write_qualisys(tmp_path / "p_Pos.xlsx", "pos", MK, rows(5))
    svc = ss.SessionService(tmp_path)
    assert svc.list_sessions()[0].frameCount == 5
    assert svc.get("p") is svc.get("p")  # cached
    write_qualisys(tmp_path / "q_Pos.xlsx", "pos", MK, rows(5))
    assert [x.id for x in svc.list_sessions()] == ["p", "q"]  # new files picked up


def test_upload_endpoint_is_stateless(tmp_path):
    from fastapi.testclient import TestClient

    from app.main import app

    write_qualisys(tmp_path / "u_Pos.xlsx", "pos", MK, rows(12, zero_from=6), first_frame=3)
    write_qualisys(tmp_path / "u_Vel.xlsx", "vel", MK, [[(3.0, 4.0, 0.0), (0.0, 0.0, 1.0)]] * 12, first_frame=3)
    c = TestClient(app)
    with open(tmp_path / "u_Pos.xlsx", "rb") as p, open(tmp_path / "u_Vel.xlsx", "rb") as v:
        r = c.post("/api/parse", files={"position": ("u_Pos.xlsx", p), "velocity": ("u_Vel.xlsx", v)})
    assert r.status_code == 200
    j = r.json()
    assert j["meta"]["id"] == "u" and j["meta"]["hasVelocity"] and j["meta"]["frameCount"] == 12
    assert len(j["data"]["positions"]) == 12 * 2 * 3
    with open(tmp_path / "u_Pos.xlsx", "rb") as p:  # position only
        assert c.post("/api/parse", files={"position": ("u_Pos.xlsx", p)}).json()["meta"]["hasVelocity"] is False
    bad = c.post("/api/parse", files={"position": ("x_Pos.xlsx", b"not excel")})
    assert bad.status_code == 422


def test_upload_size_limit(monkeypatch):
    from fastapi.testclient import TestClient

    from app import config
    from app.main import app

    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 100)
    r = TestClient(app).post("/api/parse", files={"position": ("big_Pos.xlsx", b"x" * 500)})
    assert r.status_code == 413
