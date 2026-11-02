"""Small JSON bridge around youtube-transcript-api. Writes only JSON to stdout."""

import json
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def fail(code: str, message: str, exit_code: int) -> None:
    print(json.dumps({"ok": False, "errorCode": code, "message": message}))
    raise SystemExit(exit_code)


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].strip():
        fail("INVALID_VIDEO_ID", "A YouTube video ID is required.", 2)

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api._errors import (
            AgeRestricted,
            InvalidVideoId,
            NoTranscriptFound,
            RequestBlocked,
            TranscriptsDisabled,
            VideoUnavailable,
            YouTubeRequestFailed,
        )
    except ModuleNotFoundError:
        fail("PACKAGE_NOT_INSTALLED", "Python package youtube-transcript-api is not installed.", 3)

    video_id = sys.argv[1].strip()
    try:
        transcript = YouTubeTranscriptApi().fetch(video_id)
        segments = [
            {"text": item.text.strip(), "start": item.start, "duration": item.duration}
            for item in transcript
            if item.text.strip()
        ]
        if not segments:
            fail("MALFORMED_RESPONSE", "YouTube returned captions with no speech.", 4)
        print(json.dumps({
            "ok": True,
            "language": transcript.language,
            "languageCode": transcript.language_code,
            "isGenerated": transcript.is_generated,
            "segments": segments,
        }, ensure_ascii=False))
    except (TranscriptsDisabled, NoTranscriptFound):
        fail("TRANSCRIPT_UNAVAILABLE", "No usable YouTube captions are available for this video.", 5)
    except (VideoUnavailable, AgeRestricted):
        fail("VIDEO_UNAVAILABLE", "The YouTube video is unavailable for local caption retrieval.", 6)
    except InvalidVideoId:
        fail("INVALID_VIDEO_ID", "The episode does not have a valid YouTube video ID.", 7)
    except RequestBlocked:
        fail("YOUTUBE_REQUEST_BLOCKED", "YouTube blocked local caption access from this network.", 8)
    except YouTubeRequestFailed:
        fail("YOUTUBE_REQUEST_FAILED", "YouTube caption retrieval failed.", 9)
    except SystemExit:
        raise
    except Exception as error:  # Keep stack traces out of stdout/UI.
        print(f"youtube transcript bridge: {type(error).__name__}: {error}", file=sys.stderr)
        fail("SCRIPT_ERROR", "The local transcript bridge failed unexpectedly.", 10)


if __name__ == "__main__":
    main()
