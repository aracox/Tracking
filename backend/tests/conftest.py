from pathlib import Path

import pytest
from openpyxl import Workbook

REAL_DATA = Path(__file__).resolve().parents[2] / "data"


def write_qualisys(path: Path, kind: str, markers, rows, freq=100, first_frame=1):
    """rows: list of per-frame lists of (x,y,z) tuples (or None cells)."""
    wb = Workbook()
    ws = wb.active
    cols = [f"{m}_{kind}_{a}" for m in markers for a in "XYZ"]
    ws.append(["NO_OF_FRAMES", len(rows)])
    ws.append(["NO_OF_DATA_TYPES", len(cols)])
    ws.append(["FREQUENCY", freq])
    ws.append(["TIME_STAMP", "2026-01-01, 00:00:00"])
    ws.append(["DATA_INCLUDED", "Position" if kind == "pos" else "Velocity"])
    ws.append(["DATA_TYPES", *cols])
    ws.append([])
    ws.append(["Frame", "Time", *cols])
    for i, r in enumerate(rows):
        f = first_frame + i
        flat = [c for xyz in r for c in xyz]
        ws.append([f, round((f - 1) / freq, 5), *flat])
    wb.save(path)


@pytest.fixture
def synth_dir(tmp_path):
    return tmp_path


@pytest.fixture(scope="session")
def real_data_dir():
    if not (REAL_DATA / "test1_Pos.xlsx").exists():
        pytest.skip("data/test1_Pos.xlsx not present")
    return REAL_DATA
