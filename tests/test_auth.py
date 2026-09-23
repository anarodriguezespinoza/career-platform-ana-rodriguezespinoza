import pytest

from app import auth
from app.auth import AuthenticationError, AuthorizationError, require_admin_token
from tests.conftest import make_token


def test_accepts_an_allowlisted_owner_id_token():
    identity = require_admin_token(make_token())
    assert (identity.subject, identity.email) == ("owner-sub", "owner@example.com")


def test_allowlist_matches_subject_or_case_insensitive_email(monkeypatch):
    assert require_admin_token(make_token(email="OWNER@example.com")).email == "OWNER@example.com"
    monkeypatch.setenv("COGNITO_ADMIN_SUBJECT", "special-sub")
    assert require_admin_token(make_token(email="other@example.com", subject="special-sub")).subject == "special-sub"


@pytest.mark.parametrize(
    "claims",
    [
        {"token_use": "access"},
        {"aud": "another-client"},
        {"iss": "https://evil.example.com"},
        {"exp": 1},
        {"email": None},
    ],
)
def test_rejects_invalid_tokens(claims):
    with pytest.raises(AuthenticationError):
        require_admin_token(make_token(**claims))


def test_rejects_missing_token_and_garbage():
    for token in (None, "", "not-a-jwt"):
        with pytest.raises(AuthenticationError):
            require_admin_token(token)


def test_forbids_signed_in_users_outside_the_allowlist(monkeypatch):
    with pytest.raises(AuthorizationError):
        require_admin_token(make_token(email="stranger@example.com", subject="stranger"))
    monkeypatch.setenv("COGNITO_ADMIN_EMAILS", "")
    with pytest.raises(AuthorizationError):
        require_admin_token(make_token())


def test_session_route_sets_http_only_cookie(client):
    token = make_token()
    response = client.get("/api/auth/session", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"authenticated": True, "user": {"subject": "owner-sub", "email": "owner@example.com"}}
    cookie = response.headers["set-cookie"]
    assert f"{auth.SESSION_COOKIE}={token}" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert "Secure" not in cookie


def test_session_route_status_codes(client):
    assert client.get("/api/auth/session").status_code == 401
    stranger = make_token(email="stranger@example.com", subject="stranger")
    assert client.get("/api/auth/session", headers={"Authorization": f"Bearer {stranger}"}).status_code == 403


def test_sign_in_sets_cookie_and_redirects_to_return_path(client, monkeypatch):
    token = make_token()
    monkeypatch.setattr("app.routes.auth.cognito_sign_in", lambda email, password: token)
    response = client.post("/sign-in", data={"email": "owner@example.com", "password": "pw", "returnTo": "/admin/inquiries"}, follow_redirects=False)
    assert response.status_code == 303 and response.headers["location"] == "/admin/inquiries"
    assert auth.SESSION_COOKIE in response.headers["set-cookie"]


@pytest.mark.parametrize("return_to", ["https://evil.example.com", "//evil.example.com", "/admin//evil", "/public"])
def test_sign_in_ignores_unsafe_return_paths(client, monkeypatch, return_to):
    monkeypatch.setattr("app.routes.auth.cognito_sign_in", lambda email, password: make_token())
    response = client.post("/sign-in", data={"email": "o@example.com", "password": "pw", "returnTo": return_to}, follow_redirects=False)
    assert response.headers["location"] == "/admin"


def test_sign_in_failure_shows_generic_error(client, monkeypatch):
    def fail(email, password):
        raise auth.SignInError("bad password")

    monkeypatch.setattr("app.routes.auth.cognito_sign_in", fail)
    response = client.post("/sign-in", data={"email": "owner@example.com", "password": "wrong"})
    assert response.status_code == 401
    assert "Sign-in failed. Check your credentials and try again." in response.text


def test_sign_in_rejects_non_allowlisted_accounts(client, monkeypatch):
    monkeypatch.setattr("app.routes.auth.cognito_sign_in", lambda email, password: make_token(email="stranger@example.com", subject="s"))
    response = client.post("/sign-in", data={"email": "stranger@example.com", "password": "pw"}, follow_redirects=False)
    assert response.status_code == 401 and "set-cookie" not in response.headers


def test_sign_out_clears_cookie(admin_client):
    response = admin_client.post("/sign-out", follow_redirects=False)
    assert response.status_code == 303 and f'{auth.SESSION_COOKIE}=""' in response.headers["set-cookie"]
