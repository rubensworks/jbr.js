# LDBC SNB Interactive query templates

SPARQL versions of the [LDBC SNB Interactive](https://ldbcouncil.org/benchmarks/snb/) short (IS1-7) and complex (IC1-14) queries.
LDBC only defines these queries in prose, so there is no normative SPARQL version.

These templates are based on the [SolidBench templates](https://github.com/SolidBench/SolidBench.js/tree/master/templates/queries),
which in turn derive from the community SPARQL implementation in [ldbc_snb_interactive_impls](https://github.com/ldbc/ldbc_snb_interactive_impls/tree/c19be0e793680497de4e88d360a20708cfcf43a9/sparql/queries).
Prefixes use the original vocabulary that the datagen emits (`http://www.ldbc.eu/ldbc_socialnet/1.0/`, `http://dbpedia.org/`).
Variables such as `?rootPerson`, `?person`, `?message`, `?firstName` or `?maxDate` are replaced during instantiation (see `../query-config.json`).

## Changes compared to the originals

Correctness fixes, which apply to any spec-compliant SPARQL engine:

* IS2, IS3, IS7: restored the spec's `ORDER BY`, which SolidBench dropped.
* IC2, IC3, IC9: `ORDER BY` referred to unbound variables (`?message`, `?sum`, `?post`), now ordered by the spec's keys.
* IC3, IC4: `dateTime + xsd:duration` is not defined in SPARQL 1.1, now uses `xsd:dayTimeDuration`. IC4's end date is exclusive.
* IC7: `DAY`/`HOURS`/`MINUTES` do not apply to durations, so `minutesLatency` is computed via Julian day numbers instead.

Rewrites for [Comunica](https://comunica.dev/), which either errored on or timed out for the original formulations at SF0.1.
They return the same results, but other engines may have handled the originals fine:

* IC1, IC10: an `OPTIONAL` subquery joined via `FILTER` on ids was replaced by one that shares `?fr`.
* IC3: starts from the messages located in the two given countries.
* IC7: aggregation subqueries first find the most recent like per liker, then the lowest message id liked at that time.
* IC8, IC9: select the top 20 in a subquery before fetching properties. IC8 also drops redundant type checks.

Not available upstream (IC13 uses non-standard Stardog `PATHS` syntax, IC14 is empty), so these are new, bounded approximations:

* IC13: shortest path length between two persons, considering at most 4 hops (-1 otherwise).
* IC14: all shortest paths of at most 3 hops, weighted as in the spec (1.0 per reply to a Post, 0.5 per reply to a Comment, in both directions).
