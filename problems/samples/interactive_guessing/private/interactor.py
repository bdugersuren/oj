import sys

def main():
    # DMOJ receives input file (case1.in) path as first arg
    if len(sys.argv) < 2:
        sys.stderr.write("Missing input file argument\n")
        sys.exit(1)
        
    input_file = sys.argv[1]
    with open(input_file, "r") as f:
        secret = int(f.read().strip())
        
    tries = 0
    while tries < 10:
        line = sys.stdin.readline()
        if not line:
            break
        try:
            guess = int(line.strip())
        except ValueError:
            sys.stderr.write("Invalid number format\n")
            sys.exit(1)
            
        tries += 1
        if guess < secret:
            sys.stdout.write(">\n")
            sys.stdout.flush()
        elif guess > secret:
            sys.stdout.write("<\n")
            sys.stdout.flush()
        else:
            sys.stdout.write("=\n")
            sys.stdout.flush()
            sys.exit(0) # Correct guess
            
    sys.stderr.write("Tries limit exceeded\n")
    sys.exit(1)

if __name__ == "__main__":
    main()
