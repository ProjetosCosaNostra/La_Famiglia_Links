#!/usr/bin/env python3
"""Configura o OAuth do Mercado Livre sem expor segredos em chat ou argumentos.

O operador executa este arquivo localmente, cola a chave secreta em um prompt
oculto e, depois de autorizar o aplicativo no navegador, cola a URL completa do
callback. O script troca o código temporário por tokens e grava tudo diretamente
nos GitHub Actions Secrets do repositório BlackGold.
"""

from __future__ import annotations

import argparse
import getpass
import json
import secrets
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import webbrowser


DEFAULT_CLIENT_ID = "4586517400616779"
DEFAULT_REDIRECT_URI = "https://blackgold-beauty-finds-br.pages.dev/mercadolivre-callback.html"
DEFAULT_REPOSITORY = "ProjetosCosaNostra/La_Famiglia_Links"
AUTHORIZE_URL = "https://auth.mercadolivre.com.br/authorization"
TOKEN_URL = "https://api.mercadolibre.com/oauth/token"


class OAuthSetupError(RuntimeError):
    """Erro seguro e explicável durante a configuração."""


def build_authorization_url(client_id: str, redirect_uri: str, state: str) -> str:
    query = urllib.parse.urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "state": state,
        }
    )
    return f"{AUTHORIZE_URL}?{query}"


def parse_callback_url(callback_url: str, expected_state: str) -> str:
    parsed = urllib.parse.urlparse(callback_url.strip())
    values = urllib.parse.parse_qs(parsed.query)
    returned_state = (values.get("state") or [""])[0]
    code = (values.get("code") or [""])[0]
    error = (values.get("error") or [""])[0]
    if error:
        raise OAuthSetupError(f"O Mercado Livre recusou a autorização: {error}.")
    if not secrets.compare_digest(returned_state, expected_state):
        raise OAuthSetupError("O parâmetro de segurança state não confere. Reinicie a autorização.")
    if not code:
        raise OAuthSetupError("A URL informada não contém o código de autorização.")
    return code


def exchange_code(
    client_id: str,
    client_secret: str,
    redirect_uri: str,
    code: str,
    timeout: int = 30,
) -> dict[str, str]:
    body = urllib.parse.urlencode(
        {
            "grant_type": "authorization_code",
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        TOKEN_URL,
        data=body,
        headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise OAuthSetupError(f"A troca do código falhou no Mercado Livre (HTTP {exc.code}).") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise OAuthSetupError("Não foi possível concluir a troca segura do código.") from exc

    access_token = str(payload.get("access_token") or "").strip()
    refresh_token = str(payload.get("refresh_token") or "").strip()
    if not access_token or not refresh_token:
        raise OAuthSetupError("O Mercado Livre não devolveu access_token e refresh_token completos.")
    return {"access_token": access_token, "refresh_token": refresh_token}


def require_github_cli(repository: str) -> None:
    if not shutil.which("gh"):
        raise OAuthSetupError("GitHub CLI (gh) não foi encontrado no PATH.")
    status = subprocess.run(
        ["gh", "auth", "status"],
        text=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if status.returncode != 0:
        raise OAuthSetupError("GitHub CLI não está autenticado. Execute gh auth login uma única vez.")
    check = subprocess.run(
        ["gh", "repo", "view", repository, "--json", "nameWithOwner"],
        text=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if check.returncode != 0:
        raise OAuthSetupError(f"A conta atual do GitHub não acessa {repository}.")


def set_github_secret(repository: str, name: str, value: str) -> None:
    result = subprocess.run(
        ["gh", "secret", "set", name, "--repo", repository],
        input=value,
        text=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise OAuthSetupError(f"Falha ao gravar o secret {name} no GitHub.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Ativa o OAuth Mercado Livre da BlackGold com prompts seguros.")
    parser.add_argument("--client-id", default=DEFAULT_CLIENT_ID)
    parser.add_argument("--redirect-uri", default=DEFAULT_REDIRECT_URI)
    parser.add_argument("--repository", default=DEFAULT_REPOSITORY)
    parser.add_argument("--no-browser", action="store_true", help="Somente exibe o endereço de autorização.")
    args = parser.parse_args()

    try:
        require_github_cli(args.repository)
        client_secret = getpass.getpass("Cole a Chave secreta do Mercado Livre (entrada oculta): ").strip()
        if not client_secret:
            raise OAuthSetupError("A chave secreta não foi informada.")

        state = secrets.token_urlsafe(32)
        authorization_url = build_authorization_url(args.client_id, args.redirect_uri, state)
        print("\nAbrindo a autorização oficial do Mercado Livre...")
        if args.no_browser or not webbrowser.open(authorization_url, new=2):
            print(authorization_url)
        print(
            "Depois de autorizar, copie a URL COMPLETA da barra de endereços da página BlackGold.\n"
            "Cole essa URL somente aqui no terminal; nunca no chat."
        )
        callback_url = getpass.getpass("URL completa do callback (entrada oculta): ").strip()
        code = parse_callback_url(callback_url, state)
        tokens = exchange_code(args.client_id, client_secret, args.redirect_uri, code)

        values = {
            "MELI_CLIENT_ID": args.client_id,
            "MELI_CLIENT_SECRET": client_secret,
            "MELI_ACCESS_TOKEN": tokens["access_token"],
            "MELI_REFRESH_TOKEN": tokens["refresh_token"],
        }
        for name, value in values.items():
            set_github_secret(args.repository, name, value)

        print("\nOK: OAuth Mercado Livre configurado nos GitHub Actions Secrets.")
        print("Nenhuma chave ou token foi exibido, salvo em arquivo ou colocado em argumento de processo.")
        return 0
    except OAuthSetupError as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
