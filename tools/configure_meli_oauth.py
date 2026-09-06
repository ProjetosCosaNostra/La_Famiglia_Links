#!/usr/bin/env python3
"""Configura o OAuth do Mercado Livre sem expor segredos em chat ou argumentos.

O operador pode usar prompts ocultos tradicionais ou o modo ``--clipboard``.
Nesse modo, a Chave secreta é lida diretamente da área de transferência e
apagada em seguida; depois da autorização, o retorno completo do callback também
é lido do clipboard, evitando problemas de colagem em prompts ocultos do Windows.
Os tokens são gravados diretamente nos GitHub Actions Secrets.
"""

from __future__ import annotations

import argparse
import getpass
import hashlib
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


def safe_fingerprint(value: str) -> str:
    """Retorna uma impressão curta para diagnóstico sem revelar o valor."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12] if value else "ausente"


def clipboard_shell() -> str:
    shell = shutil.which("powershell") or shutil.which("pwsh")
    if not shell:
        raise OAuthSetupError("PowerShell não foi encontrado para ler a área de transferência.")
    return shell


def read_clipboard() -> str:
    """Lê o clipboard sem ecoar o conteúdo no terminal."""
    result = subprocess.run(
        [clipboard_shell(), "-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if result.returncode != 0:
        raise OAuthSetupError("Não foi possível ler a área de transferência do Windows.")
    return result.stdout.strip()


def clear_clipboard() -> None:
    """Apaga silenciosamente o clipboard depois de consumir material sensível."""
    try:
        subprocess.run(
            [clipboard_shell(), "-NoProfile", "-NonInteractive", "-Command", "Set-Clipboard -Value ''"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except OAuthSetupError:
        pass


def safe_http_error_detail(exc: urllib.error.HTTPError) -> str:
    """Extrai somente campos públicos de erro OAuth, nunca tokens ou credenciais."""
    try:
        raw = exc.read().decode("utf-8", errors="replace")
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
        return ""
    if not isinstance(payload, dict):
        return ""

    parts: list[str] = []
    for key in ("error", "error_description", "message", "status"):
        value = payload.get(key)
        if value is None or isinstance(value, (dict, list)):
            continue
        text = str(value).replace("\r", " ").replace("\n", " ").strip()
        if text:
            parts.append(f"{key}={text[:300]}")
    return "; ".join(parts)


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


def canonical_callback_identity(value: str) -> tuple[str, str, str]:
    """Normaliza apenas a identidade fixa do callback, ignorando query/fragment.

    Cloudflare Pages canonicaliza arquivos ``.html`` para a rota sem extensão.
    Ambas as formas são tratadas como o mesmo callback oficial.
    """
    parsed = urllib.parse.urlparse(value.strip())
    path = parsed.path.rstrip("/") or "/"
    if path.endswith(".html"):
        path = path[:-5]
    return parsed.scheme.casefold(), parsed.netloc.casefold(), path


def parse_callback_url(callback_url: str, expected_state: str, expected_redirect_uri: str) -> tuple[str, bool]:
    parsed = urllib.parse.urlparse(callback_url.strip())
    values = urllib.parse.parse_qs(parsed.query)
    returned_state = (values.get("state") or [""])[0]
    code = (values.get("code") or [""])[0]
    error = (values.get("error") or [""])[0]

    if canonical_callback_identity(callback_url) != canonical_callback_identity(expected_redirect_uri):
        raise OAuthSetupError("A URL informada não pertence ao callback oficial BlackGold.")
    if error:
        raise OAuthSetupError(f"O Mercado Livre recusou a autorização: {error}.")
    if not code:
        raise OAuthSetupError("A URL informada não contém o código de autorização.")

    if returned_state:
        if not secrets.compare_digest(returned_state, expected_state):
            raise OAuthSetupError(
                "O parâmetro de segurança state não confere. "
                f"Diagnóstico seguro: esperado={safe_fingerprint(expected_state)} "
                f"recebido={safe_fingerprint(returned_state)} "
                f"tamanho_esperado={len(expected_state)} tamanho_recebido={len(returned_state)}."
            )
        return code, False

    return code, True


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
        detail = safe_http_error_detail(exc)
        suffix = f": {detail}" if detail else "."
        raise OAuthSetupError(f"A troca do código falhou no Mercado Livre (HTTP {exc.code}){suffix}") from exc
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
    parser.add_argument(
        "--clipboard",
        action="store_true",
        help="Lê a Chave secreta e depois o callback diretamente da área de transferência.",
    )
    args = parser.parse_args()

    try:
        require_github_cli(args.repository)

        if args.clipboard:
            client_secret = read_clipboard()
            if not client_secret:
                raise OAuthSetupError("A área de transferência está vazia; copie a Chave secreta do Mercado Livre primeiro.")
            clear_clipboard()
            print("Chave secreta lida da área de transferência com segurança e removida do clipboard.")
        else:
            client_secret = getpass.getpass("Cole a Chave secreta do Mercado Livre (entrada oculta): ").strip()
            if not client_secret:
                raise OAuthSetupError("A chave secreta não foi informada.")

        state = secrets.token_hex(32)
        authorization_url = build_authorization_url(args.client_id, args.redirect_uri, state)
        print(f"\nIdentificador seguro desta tentativa: {safe_fingerprint(state)}")
        print("Abrindo a autorização oficial do Mercado Livre...")
        if args.no_browser or not webbrowser.open(authorization_url, new=2):
            print(authorization_url)

        if args.clipboard:
            print(
                "Depois de autorizar, na página BlackGold clique em 'Copiar retorno completo para o terminal'.\n"
                "Volte ao terminal e pressione Enter. Não é necessário colar nada aqui."
            )
            input("Pressione Enter somente depois de copiar o retorno completo na página BlackGold: ")
            callback_url = read_clipboard()
            clear_clipboard()
            if not callback_url:
                raise OAuthSetupError("O clipboard está vazio; copie o retorno completo na página BlackGold e tente novamente.")
        else:
            print(
                "Depois de autorizar, copie a URL COMPLETA da barra de endereços da página BlackGold.\n"
                "Cole essa URL somente aqui no terminal; nunca no chat."
            )
            callback_url = getpass.getpass("URL completa do callback (entrada oculta): ").strip()

        code, state_missing = parse_callback_url(callback_url, state, args.redirect_uri)
        if state_missing:
            print(
                "AVISO: o Mercado Livre não devolveu o parâmetro state. "
                "Como esta é uma ativação local/manual e a URL foi validada como callback oficial, "
                "o código será trocado imediatamente sem expor credenciais."
            )
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
