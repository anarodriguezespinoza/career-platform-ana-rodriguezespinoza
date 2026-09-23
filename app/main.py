"""FastAPI application entry point."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from app.domain.admin import AdminOperationError
from app.domain.snapshot import PublicContentUnavailableError
from app.routes import admin, api, auth, public
from app.routes.errors import AdminSignInRequiredError, CrossOriginRequestError, NotFoundError
from app.templating import render


def create_app() -> FastAPI:
    app = FastAPI(title="Career Platform", docs_url=None, redoc_url=None, openapi_url=None)
    app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")
    app.include_router(public.router)
    app.include_router(api.router)
    app.include_router(auth.router)
    app.include_router(admin.router)

    @app.exception_handler(NotFoundError)
    async def not_found(request: Request, _: NotFoundError) -> HTMLResponse:
        return render(request, "not_found.html", status_code=404)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> Response:
        if error.status_code == 404 and not request.url.path.startswith("/api/"):
            return render(request, "not_found.html", status_code=404)
        return JSONResponse({"detail": error.detail}, status_code=error.status_code, headers=error.headers)

    @app.exception_handler(AdminSignInRequiredError)
    async def sign_in_required(_: Request, error: AdminSignInRequiredError) -> RedirectResponse:
        return RedirectResponse(f"/sign-in?returnTo={quote(error.return_to, safe='/')}", status_code=303)

    @app.exception_handler(CrossOriginRequestError)
    async def cross_origin(_: Request, __: CrossOriginRequestError) -> PlainTextResponse:
        return PlainTextResponse("Forbidden", status_code=403)

    @app.exception_handler(PublicContentUnavailableError)
    async def content_unavailable(request: Request, _: PublicContentUnavailableError) -> HTMLResponse:
        return render(request, "unavailable.html", status_code=503)

    @app.exception_handler(AdminOperationError)
    async def admin_operation_failed(request: Request, _: AdminOperationError) -> HTMLResponse:
        return render(request, "unavailable.html", status_code=503)

    return app


app = create_app()
