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


def test_num_extracts_leading_number_from_units():
    # 단위·통화·% 가 붙은 펀더멘털 문자열에서 앞쪽 숫자만 추출
    assert nc._num("20.93배") == 20.93
    assert nc._num("12,372원") == 12372.0
    assert nc._num("46.59%") == 46.59
    assert nc._num("31,971.60") == 31971.6
    assert nc._num(-0.21) == -0.21
    assert nc._num("-31.36") == -31.36
    assert nc._num("") is None
    assert nc._num(None) is None


def test_date_normalizers():
    assert nc._bizdate_to_iso("20260721") == "2026-07-21"
    assert nc._localdatetime_to_iso("20260721090000") == "2026-07-21T09:00:00"
    assert nc._localdatetime_to_iso("20260721153000") == "2026-07-21T15:30:00"
