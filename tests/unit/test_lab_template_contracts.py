import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SEEDS_PATH = ROOT / "apps" / "api" / "seeds.py"
MAKEFILE_PATH = ROOT / "Makefile"


def _literal_keyword(node: ast.Call, name: str):
    for keyword in node.keywords:
        if keyword.arg == name:
            return ast.literal_eval(keyword.value)
    raise AssertionError(f"Missing LabTemplate keyword: {name}")


def _active_lab_templates() -> list[dict]:
    tree = ast.parse(SEEDS_PATH.read_text(encoding="utf-8"))
    templates: list[dict] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Name) or node.func.id != "LabTemplate":
            continue

        template = {
            "id": _literal_keyword(node, "id"),
            "docker_image_uri": _literal_keyword(node, "docker_image_uri"),
            "challenge_port": _literal_keyword(node, "challenge_port"),
            "challenge_path": _literal_keyword(node, "challenge_path"),
            "is_active": _literal_keyword(node, "is_active"),
        }
        if template["is_active"]:
            templates.append(template)

    return templates


def test_active_lab_templates_have_challenge_urls_the_stack_can_serve():
    templates = _active_lab_templates()

    assert {template["id"] for template in templates} == {
        "web-sqli-01",
        "web-dvwa-01",
        "web-nexbank-01",
        "web-php-rce-01",
        "web-lfi-01",
    }

    for template in templates:
        assert template["docker_image_uri"].strip()
        assert 1 <= template["challenge_port"] <= 65535
        assert template["challenge_path"].startswith("/")


def test_ecr_backed_labs_have_matching_dockerfiles_and_push_targets():
    makefile = MAKEFILE_PATH.read_text(encoding="utf-8")

    expected_contexts = {
        "orchestryx/sqli-lab": ("labs/sqli-lab/Dockerfile", "push-sqli-lab"),
        "orchestryx/php-rce-lab": ("labs/php-rce-lab/Dockerfile", "push-php-rce-lab"),
        "orchestryx/lfi-lab": ("labs/lfi-lab/Dockerfile", "push-lfi-lab"),
    }

    for template in _active_lab_templates():
        image = template["docker_image_uri"]
        if ".dkr.ecr." not in image:
            continue

        repo = image.split(".amazonaws.com/", 1)[1].rsplit(":", 1)[0]
        dockerfile_path, make_target = expected_contexts[repo]
        dockerfile = (ROOT / dockerfile_path).read_text(encoding="utf-8")

        assert f"EXPOSE {template['challenge_port']}" in dockerfile
        assert f"{make_target}:" in makefile

    assert "push-custom-labs: push-sqli-lab push-php-rce-lab push-lfi-lab" in makefile
