import sys

def main():
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: checker.py <input> <student_output> <expected_output>\n")
        sys.exit(1)
        
    input_file = sys.argv[1]
    output_file = sys.argv[2] # Student answer
    
    with open(input_file, "r") as f:
        max_val = int(f.read().strip())
        
    with open(output_file, "r") as f:
        try:
            student_ans = int(f.read().strip())
        except ValueError:
            sys.exit(1) # WA: Invalid format
            
    # Answer must be even and <= max_val
    if student_ans % 2 == 0 and student_ans <= max_val:
        sys.exit(0) # AC
    else:
        sys.exit(1) # WA

if __name__ == "__main__":
    main()
