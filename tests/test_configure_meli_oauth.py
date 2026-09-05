import importlib.util
import sys
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse


MODULE_PATH = Path(__file__).resolve().parents[1] / "tools" / "configure_meli_oauth.py"
SPEC = importlib.util.spec_from_file_location("configure_meli_oauth", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ConfigureMeliOAuthTests(unittest.TestCase):
    def test_authorization_url_contains_exact_callback_and_state(self):
        url = MODULE.build_authorization_url("123", "https://example.test/callback", "state-safe")
        parsed = urlparse(url)
        values = parse_qs(parsed.query)
        self.assertEqual(parsed.scheme, "https")
        self.assertEqual(values["client_id"], ["123"])
        self.assertEqual(values["redirect_uri"], ["https://example.test/callback"])
        self.assertEqual(values["state"], ["state-safe"])

    def test_callback_requires_matching_state(self):
        code = MODULE.parse_callback_url("https://example.test/callback?code=abc&state=expected", "expected")
        self.assertEqual(code, "abc")
        with self.assertRaises(MODULE.OAuthSetupError):
            MODULE.parse_callback_url("https://example.test/callback?code=abc&state=wrong", "expected")

    def test_callback_surfaces_provider_error(self):
        with self.assertRaisesRegex(MODULE.OAuthSetupError, "access_denied"):
            MODULE.parse_callback_url(
                "https://example.test/callback?error=access_denied&state=expected",
                "expected",
            )


if __name__ == "__main__":
    unittest.main()
