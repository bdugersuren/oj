#include <cstdio>

int main(int argc, char **argv) {
    FILE *input = fopen(argv[1], "r");
    int secret, guess, tries = 0;
    if (!input || fscanf(input, "%d", &secret) != 1) return 2;
    while (scanf("%d", &guess) == 1) {
        ++tries;
        if (guess == secret) {
            puts("OK");
            fflush(stdout);
            return tries <= 31 ? 0 : 1;
        }
        puts(guess > secret ? "FLOATS" : "SINKS");
        fflush(stdout);
    }
    return 2;
}
