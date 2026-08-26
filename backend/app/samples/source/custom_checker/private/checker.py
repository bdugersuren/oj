def check(process_output, judge_output, judge_input, **kwargs):
    try:
        maximum = int(bytes(judge_input).strip())
        answer = int(process_output.strip())
    except (TypeError, ValueError):
        return False
    return answer % 2 == 0 and answer <= maximum
