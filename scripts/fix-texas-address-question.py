#!/usr/bin/env python3
"""Fix Texas change-of-address questions: DPS within 30 days (all languages)."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

ADDRESS_Q = re.compile(
    r"change of address|cambio de dirección|змін[уа] адреси|зміна адреси|"
    r"变更地址|地址变更|смен[уые] адрес|informar un cambio de dirección|"
    r"informarse un cambio de dirección|повідомити про зміну|"
    r"повинна бути повідомлена зміна адреси|сообщить о смене адреса|"
    r"изменении адреса|изменение адреса|уведомить о смене адреса",
    re.I,
)

OPTIONS = {
    "en": {
        "a": "To the Texas Department of Public Safety (DPS) within 30 days.",
        "b": "To the DMV within 10 days.",
        "c": "To the DMV within 30 days.",
        "d": "To the local police within 60 days.",
        "explanation": (
            "Texas law (Transportation Code § 521.054) and the Texas Driver Handbook require "
            "you to report any change of address to the Texas Department of Public Safety (DPS) "
            "within 30 days."
        ),
    },
    "es": {
        "a": "Al Departamento de Seguridad Pública de Texas (DPS) dentro de 30 días.",
        "b": "Al DMV dentro de 10 días.",
        "c": "Al DMV dentro de 30 días.",
        "d": "A la policía local dentro de 60 días.",
        "explanation": (
            "La ley de Texas (Código de Transporte § 521.054) y el Manual del Conductor de Texas "
            "exigen informar cualquier cambio de dirección al Departamento de Seguridad Pública "
            "de Texas (DPS) dentro de 30 días."
        ),
    },
    "ua": {
        "a": "До Департаменту громадської безпеки Техасу (DPS) протягом 30 днів.",
        "b": "До DMV протягом 10 днів.",
        "c": "До DMV протягом 30 днів.",
        "d": "До місцевої поліції протягом 60 днів.",
        "explanation": (
            "Закон Техасу (Транспортний кодекс § 521.054) і Посібник водія Техасу вимагають "
            "повідомити Департамент громадської безпеки Техасу (DPS) про зміну адреси протягом 30 днів."
        ),
    },
    "ru": {
        "a": "В Департамент общественной безопасности Техаса (DPS) в течение 30 дней.",
        "b": "В DMV в течение 10 дней.",
        "c": "В DMV в течение 30 дней.",
        "d": "В местную полицию в течение 60 дней.",
        "explanation": (
            "Закон Техаса (Транспортный кодекс § 521.054) и Справочник водителя Техаса требуют "
            "сообщить в Департамент общественной безопасности Техаса (DPS) об изменении адреса "
            "в течение 30 дней."
        ),
    },
    "zh": {
        "a": "在30天内向德克萨斯州公共安全部（DPS）报告。",
        "b": "在10天内向机动车管理局（DMV）报告。",
        "c": "在30天内向机动车管理局（DMV）报告。",
        "d": "在60天内向当地警方报告。",
        "explanation": (
            "德克萨斯州法律（交通法规§521.054）和《德克萨斯驾驶员手册》要求，"
            "必须在30天内向德克萨斯州公共安全部（DPS）报告地址变更。"
        ),
    },
}

PUBLIC_ANSWERS = {
    "en": [
        "A. To the Texas Department of Public Safety (DPS) within 30 days.",
        "B. To the DMV within 10 days.",
        "C. To the DMV within 30 days.",
        "D. To the local police within 60 days.",
    ],
    "es": [
        "A. Al Departamento de Seguridad Pública de Texas (DPS) dentro de 30 días.",
        "B. Al DMV dentro de 10 días.",
        "C. Al DMV dentro de 30 días.",
        "D. A la policía local dentro de 60 días.",
    ],
    "ua": [
        "A. До Департаменту громадської безпеки Техасу (DPS) протягом 30 днів.",
        "B. До DMV протягом 10 днів.",
        "C. До DMV протягом 30 днів.",
        "D. До місцевої поліції протягом 60 днів.",
    ],
    "ru": [
        "A. В Департамент общественной безопасности Техаса (DPS) в течение 30 дней.",
        "B. В DMV в течение 10 дней.",
        "C. В DMV в течение 30 дней.",
        "D. В местную полицию в течение 60 дней.",
    ],
    "zh": [
        "A. 在30天内向德克萨斯州公共安全部（DPS）报告。",
        "B. 在10天内向机动车管理局（DMV）报告。",
        "C. 在30天内向机动车管理局（DMV）报告。",
        "D. 在60天内向当地警方报告。",
    ],
}

LANG_MAP = {"en": "en", "es": "es", "ua": "ua", "ru": "ru", "zh": "zh", "cn": "zh"}


def with_letter_prefix(text: str, letter: str) -> str:
    stripped = re.sub(r"^[A-D]\.\s*", "", text.strip())
    return f"{letter}. {stripped}"


def apply_options(q: dict, lang: str) -> bool:
    opts = OPTIONS.get(lang)
    if not opts:
        return False
    sample = q.get("option_a") or ""
    use_prefix = bool(re.match(r"^[A-D]\.\s", sample))
    letters = "abcd"
    for i, letter in enumerate(letters):
        val = opts[letter]
        key = f"option_{letter}"
        if use_prefix:
            val = with_letter_prefix(val, letter.upper())
        q[key] = val
    q["correct_answer"] = 0
    q["explanation"] = opts["explanation"]
    return True


def load_all_questions(path: Path) -> tuple[str, list]:
    raw = path.read_text(encoding="utf-8")
    prefix = ""
    body = raw
    if body.startswith("claude"):
        m = re.match(r"^(claude\s*\n*)", body)
        if m:
            prefix = m.group(1)
            body = body[len(prefix) :]
    body = body.lstrip()
    if not body.startswith("["):
        body = "[\n" + body
    data = json.loads(body)
    return prefix, data


def save_all_questions(path: Path, prefix: str, data: list) -> None:
    body = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(prefix + body + "\n", encoding="utf-8")


def fix_all_questions() -> list[str]:
    path = ROOT / "all-questions.json"
    prefix, data = load_all_questions(path)
    changed_ids = []
    for q in data:
        if q.get("state") != "texas":
            continue
        if not ADDRESS_Q.search(q.get("question_text") or ""):
            continue
        lang = q.get("language", "en")
        if apply_options(q, lang):
            changed_ids.append(q["id"])
    save_all_questions(path, prefix, data)
    return changed_ids


def fix_public_texas(path: Path, lang_key: str) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    answers = PUBLIC_ANSWERS[lang_key]
    count = 0

    def walk(obj):
        nonlocal count
        if isinstance(obj, dict):
            qtext = obj.get("question", "")
            if ADDRESS_Q.search(qtext):
                obj["answers"] = list(answers)
                obj["correctAnswerIndex"] = 0
                count += 1
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for item in obj:
                walk(item)

    walk(data)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return count


def fix_rollback_snapshot() -> bool:
    path = ROOT / ".cluster-questions-texas-rollback.json"
    if not path.exists():
        return False
    data = json.loads(path.read_text(encoding="utf-8"))
    qid = "25d5afe4-6221-4979-82f1-b77411e040ad"
    for q in data:
        if q.get("id") == qid:
            apply_options(q, "en")
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            return True
    return False


def main():
    ids = fix_all_questions()
    print(f"all-questions.json: updated {len(ids)} questions")
    for i in ids:
        print(f"  - {i}")

    public_files = [
        (ROOT / "public/data/en/texas.json", "en"),
        (ROOT / "public/data/texas.json", "en"),
        (ROOT / "public/data/es/texas.json", "es"),
        (ROOT / "public/data/ua/texas.json", "ua"),
        (ROOT / "public/data/ru/texas.json", "ru"),
        (ROOT / "public/data/cn/texas.json", "zh"),
        (ROOT / "public/data/texas-translate-cli-russian-test.json.ru.json", "ru"),
        (ROOT / "public/data/en/texas-translate-cli-russian-test.json.ru.json", "ru"),
    ]
    for p, lang in public_files:
        if p.exists():
            n = fix_public_texas(p, lang)
            print(f"{p.relative_to(ROOT)}: updated {n} occurrences")

    if fix_rollback_snapshot():
        print("Updated .cluster-questions-texas-rollback.json snapshot for primary ID")

    # manual_reference in progress file is already correct; no change needed
    return 0


if __name__ == "__main__":
    sys.exit(main())
