## Security contact information

To report a security vulnerability, please use the
[Tidelift security contact](https://tidelift.com/security).
Tidelift will coordinate the fix and disclosure.

## Security model

brace-expansion is a library. Its job is to expand brace patterns such as `a{b,c}d` into a list of strings.

### What we treat as untrusted

The pattern passed to `expand()`, even when your own code is the one that passes it in. Apps often forward patterns from end users, so we assume a pattern may have been crafted by an attacker. With the default limits, expanding it should never hang, take time far beyond the size of the input and the output, use memory far beyond that size, or crash the process (for example with a stack overflow).

### What we treat as trusted

- The limit options (`max`, `maxLength`, `maxDepth`, `maxRewrites`, `maxSteps`). These are developer settings and are never meant to carry end-user data.
- What your application does with the result.

### What we do not consider a vulnerability

- Problems that only happen after you raise or remove a limit, for example `maxSteps: Infinity`, and then pass an untrusted pattern.
- A default limit being reached and the result being cut short, as the README describes. That is the limit doing its job.
