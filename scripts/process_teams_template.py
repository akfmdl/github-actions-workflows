#!/usr/bin/env python3
"""
Teams JSON 템플릿 처리 스크립트

이 스크립트는 JSON 템플릿 파일을 읽어서 변수를 안전하게 치환하고,
완성된 JSON을 출력합니다. 특히 릴리즈 노트의 개행 문자를 올바르게 처리합니다.

사용법:
python3 process_teams_template.py <template_file> --image-info <image_info> --repo-info <repo_info> --release-notes-file <release_notes_file> [--output <output_file>]
"""

import argparse
import json
import os
import re
import sys


def load_release_notes(file_path):
    """릴리즈 노트 파일을 읽어서 반환합니다."""
    try:
        if not file_path or not os.path.exists(file_path):
            return "릴리즈 노트를 찾을 수 없습니다."

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # GitHub 마크다운 헤더를 Teams용 굵게 텍스트로 변환
        content = re.sub(r"^## (.*)$", r"**\1**", content, flags=re.MULTILINE)

        return content.strip()
    except Exception as e:
        print(f"⚠️ 릴리즈 노트 읽기 실패: {e}", file=sys.stderr)
        return "릴리즈 노트를 읽을 수 없습니다."


def replace_variables_in_object(obj, variables):
    """JSON 객체 내의 모든 변수를 재귀적으로 치환합니다."""
    if isinstance(obj, str):
        # 문자열에서 ${변수명} 패턴을 찾아서 치환
        result = obj
        for key, value in variables.items():
            pattern = f"${{{key}}}"
            result = result.replace(pattern, str(value))
        return result
    elif isinstance(obj, list):
        return [replace_variables_in_object(item, variables) for item in obj]
    elif isinstance(obj, dict):
        return {key: replace_variables_in_object(value, variables) for key, value in obj.items()}
    else:
        return obj


def process_teams_template(template_file, image_info, repo_info, release_notes_file, output_file=None):
    """Teams JSON 템플릿을 처리합니다."""
    try:
        # 템플릿 파일 읽기
        if not os.path.exists(template_file):
            raise FileNotFoundError(f"템플릿 파일을 찾을 수 없습니다: {template_file}")

        with open(template_file, "r", encoding="utf-8") as f:
            template = json.load(f)

        # 릴리즈 노트 로드
        release_notes = load_release_notes(release_notes_file)

        # 변수 딕셔너리 구성
        variables = {"IMAGE_INFO": image_info, "REPO_INFO": repo_info, "RELEASE_NOTES": release_notes}

        print("📝 변수 치환 정보:", file=sys.stderr)
        print(f"  - IMAGE_INFO: {image_info}", file=sys.stderr)
        print(f"  - REPO_INFO: {repo_info}", file=sys.stderr)
        print(f"  - RELEASE_NOTES 길이: {len(release_notes)} 문자", file=sys.stderr)

        # 템플릿에서 변수 치환
        result = replace_variables_in_object(template, variables)

        # JSON으로 직렬화 (개행 문자가 자동으로 \n으로 이스케이프됨)
        json_output = json.dumps(result, ensure_ascii=False, separators=(",", ":"))

        # 출력
        if output_file:
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(json_output)
            print(f"📄 Teams JSON 저장 완료: {output_file}", file=sys.stderr)
        else:
            print(json_output)

        print("✅ Teams JSON 처리 완료", file=sys.stderr)

    except Exception as e:
        print(f"❌ Teams JSON 처리 실패: {e}", file=sys.stderr)
        # 실패 시 기본 메시지 출력
        fallback = {"type": "message", "text": "Teams 메시지를 생성할 수 없습니다."}
        print(json.dumps(fallback))
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Teams JSON 템플릿 처리 스크립트")
    parser.add_argument("template_file", help="Teams JSON 템플릿 파일 경로")
    parser.add_argument("--image-info", required=True, help="이미지 정보 (예: audio-engine-server:2025.06.0.0)")
    parser.add_argument("--repo-info", required=True, help="리포지토리 정보 (예: akfmdl/mlops-lifecycle)")
    parser.add_argument("--release-notes-file", required=True, help="릴리즈 노트 파일 경로 (예: RELEASE_NOTES.md)")
    parser.add_argument("--output", help="출력 파일 경로 (기본값: stdout)")

    args = parser.parse_args()

    process_teams_template(
        template_file=args.template_file,
        image_info=args.image_info,
        repo_info=args.repo_info,
        release_notes_file=args.release_notes_file,
        output_file=args.output,
    )


if __name__ == "__main__":
    main()
