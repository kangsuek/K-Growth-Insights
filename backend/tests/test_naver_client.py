"""Unit tests for Naver mobile API response normalization (no network)."""
from app.services import naver_client as nc


def test_to_int_handles_naver_formats():
    assert nc._to_int("+1,129,083") == 1129083
    assert nc._to_int("-826,076") == -826076
    assert nc._to_int("1,877,021") == 1877021
    assert nc._to_int(61018) == 61018
    assert nc._to_int("") is None
    assert nc._to_int("-") is None
    assert nc._to_int(None) is None


def test_to_float_handles_percent_and_sign():
    assert nc._to_float("6.56") == 6.56
    assert nc._to_float("+6.56") == 6.56
    assert nc._to_float("46.59%") == 46.59
    assert nc._to_float("") is None
    assert nc._to_float(None) is None


def test_date_normalizers():
    assert nc._bizdate_to_iso("20260721") == "2026-07-21"
    assert nc._localdatetime_to_iso("20260721090000") == "2026-07-21T09:00:00"
    assert nc._localdatetime_to_iso("20260721153000") == "2026-07-21T15:30:00"
