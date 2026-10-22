from app import models
from app.seed import seed


def test_seed_is_real_idempotent_and_renders(client, session):
    seed()
    seed()
    assert session.query(models.Profile).count() == 1
    assert session.query(models.Project).one().name == "This website (in progress)"
    companies = {row.company for row in session.query(models.Experience)}
    assert "Career Platform" not in companies and "Hatch Baby Inc" in companies
    projects = client.get("/projects")
    assert projects.status_code == 200 and "This website (in progress)" in projects.text
