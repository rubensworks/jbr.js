# LDBC SNB Interactive query templates

SPARQL versions of the [LDBC SNB Interactive](https://ldbcouncil.org/benchmarks/snb/) short (IS1-7) and complex (IC1-14) queries.
LDBC only defines these queries in prose, so there is no normative SPARQL version.

These templates are based on the [SolidBench templates](https://github.com/SolidBench/SolidBench.js/tree/master/templates/queries),
which in turn derive from the community SPARQL implementation in [ldbc_snb_interactive_impls](https://github.com/ldbc/ldbc_snb_interactive_impls/tree/c19be0e793680497de4e88d360a20708cfcf43a9/sparql/queries).
Prefixes use the original vocabulary that the datagen emits (`http://www.ldbc.eu/ldbc_socialnet/1.0/`, `http://dbpedia.org/`).
Variables such as `?rootPerson`, `?person`, `?message`, `?firstName` or `?maxDate` are replaced during instantiation (see `../query-config.json`).

## Changes compared to the originals

Only fixes that apply to any spec-compliant SPARQL engine were made; all other templates are unchanged:

* IS2, IS3, IS7: restored the spec's `ORDER BY`, which SolidBench dropped.
* IC2: ordered by message id as the spec requires, instead of by message IRI.
* IC3, IC9: `ORDER BY` referred to unbound variables (`?sum`, `?post`), now ordered by the spec's keys.
* IC3, IC4: `dateTime + xsd:duration` is not defined in SPARQL 1.1, now uses `xsd:dayTimeDuration`. IC4's end date is exclusive.
* IC7: `DAY`/`HOURS`/`MINUTES` do not apply to durations, so `minutesLatency` is computed via Julian day numbers instead.

Not available upstream (IC13 uses non-standard Stardog `PATHS` syntax, IC14 is empty), so these are new, bounded approximations:

* IC13: shortest path length between two persons, considering at most 4 hops (-1 otherwise).
* IC14: all shortest paths of at most 3 hops, weighted as in the spec (1.0 per reply to a Post, 0.5 per reply to a Comment, in both directions).
