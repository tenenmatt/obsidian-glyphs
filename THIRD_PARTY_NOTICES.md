# Third-party notices

Pen Glyphs includes one piece of third-party code. Everything else in the plugin is original to this project.

## $P Point-Cloud Recognizer

- **Used in:** `src/recognize/pdollar.ts`, and therefore in the built `main.js`.
- **What:** a TypeScript port of the reference JavaScript implementation, `pdollar.js` (last updated July 14, 2018), by Radu-Daniel Vatavu, Lisa Anthony and Jacob O. Wobbrock, published at <https://depts.washington.edu/acelab/proj/dollar/pdollar.html>.
- **Changes:** typed module instead of globals; the reference's built-in demo templates removed; input never mutated; zero-length and zero-size input handled without dividing by zero; recognition ranks every template instead of returning only the best. The algorithm is otherwise unchanged.
- **License:** New BSD License (BSD-3-Clause), reproduced below. The full original header, including this notice, is kept verbatim in `src/recognize/pdollar.ts` and is preserved in the built `main.js`.

The academic publication for the $P recognizer, and what should be
used to cite it, is:

    Vatavu, R.-D., Anthony, L. and Wobbrock, J.O. (2012).
    Gestures as point clouds: A $P recognizer for user interface
    prototypes. Proceedings of the ACM Int'l Conference on
    Multimodal Interfaces (ICMI '12). Santa Monica, California
    (October 22-26, 2012). New York: ACM Press, pp. 273-280.
    https://dl.acm.org/citation.cfm?id=2388732

```
This software is distributed under the "New BSD License" agreement:

Copyright (C) 2012, Radu-Daniel Vatavu, Lisa Anthony, and
Jacob O. Wobbrock. All rights reserved. Last updated July 14, 2018.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
   * Redistributions of source code must retain the above copyright
     notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above copyright
     notice, this list of conditions and the following disclaimer in the
     documentation and/or other materials provided with the distribution.
   * Neither the names of the University Stefan cel Mare of Suceava,
    University of Washington, nor UMBC, nor the names of its contributors
    may be used to endorse or promote products derived from this software
    without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL Radu-Daniel Vatavu OR Lisa Anthony
OR Jacob O. Wobbrock BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT
OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
SUCH DAMAGE.
```

## Build and test tools

These are development dependencies only. None of their code is included in the built plugin (`main.js`); `obsidian` is provided by the Obsidian app at runtime and supplies type definitions only.

| Package | License |
|---|---|
| obsidian (type definitions) | MIT |
| esbuild | MIT |
| typescript | Apache-2.0 |
| vitest, @vitest/coverage-v8 | MIT |
| happy-dom | MIT |
| @types/node | MIT |
