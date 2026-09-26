# LDBC SNB BI query templates

SPARQL versions of the [LDBC SNB Business Intelligence (BI v1, 2018)](https://ldbcouncil.org/benchmarks/snb/) queries BI1-24.
The SPARQL representations are not officially defined by LDBC.

These templates are taken from the community SPARQL implementation in [ldbc_snb_interactive_v1_impls](https://github.com/ldbc/ldbc_snb_interactive_v1_impls/tree/c19be0e793680497de4e88d360a20708cfcf43a9/sparql/queries) (files `bi-N.sparql`).
At that commit, the source repository was licensed under GPL-3.0, the same situation as the Interactive templates in `../queries/`.
They already use the vocabulary that the datagen emits (`http://www.ldbc.eu/ldbc_socialnet/1.0/`, `http://dbpedia.org/`), so prefixes are unchanged.
Parameters such as `$country` or `$date` are replaced during instantiation (see `../query-config-bi.json`),
using the datagen's `bi_N_param.txt` files.

## Excluded queries

* BI16: its variable-length path bounds (`$minPathDistance`, `$maxPathDistance`) are substituted as SPARQL fragments upstream, which cannot be expressed as a single template.
* BI25: empty upstream.

## Changes compared to the originals

The instantiator treats `$x` and `?x` as the same variable (as in SPARQL), while the originals assumed textual `$x` substitution.
It also only instantiates the `WHERE` clause, projections and `GROUP BY`, not `VALUES` data, `HAVING` or `ORDER BY`.
Therefore, the following changes were needed:

* BI3, BI4, BI5, BI6, BI9, BI10, BI17: renamed internal variables that clashed with a parameter name (`?year`/`?month` to `?messageYear`/`?messageMonth` in BI3, `?country` to `?countryNode`, `?tagClass` to `?tagClassNode`, `?tagClass1`/`?tagClass2` to `?tagClassNode1`/`?tagClassNode2`, `?tag` to `?tagNode`).
* BI3: `VALUES (?year1 ?month1) {($year $month)}` is not valid SPARQL, replaced by two `BIND`s.
* BI9, BI12: the threshold parameter in `HAVING` is bound in the `WHERE` clause (as `?minMemberCount`/`?minLikeCount`) and added to `GROUP BY`.
* BI11: the `;`-separated `$blacklist` is turned into a regex alternation with `REPLACE($blacklist, ";", "|")`.
* BI18, BI20: `VALUES (?language) {$languages}` and `VALUES (?tagClassName) {$tagClasses}` are not valid SPARQL.
  They were replaced by `FILTER(REGEX(?x, CONCAT("^(", REPLACE($list, ";", "|"), ")$")))`, where the `;`-separated list is turned into an anchored regex alternation.
  In BI18, this filter is placed inside the `OPTIONAL` block that binds `?language`.
* BI19: `$date` is replaced by the constant `"1989-01-01"^^xsd:date`, which is the only value the datagen emits (`serialize_q19` in `paramgenerator/generateparamsbi.py`), and which matches the `xsd:date` datatype of birthdays.
* BI19, BI22: `EXISTS { {A} UNION {B} }` over the `knows` relation is rewritten as an equivalent alternative property path `(snvoc:knows/snvoc:hasPerson)|^(snvoc:knows/snvoc:hasPerson)`, since the instantiator does not support a `UNION` directly inside `EXISTS`.

Some queries referred to aggregate aliases in `GROUP BY` or `HAVING`, where they are unbound in SPARQL 1.1, which led to empty results or parse errors:

* BI2, BI12, BI15: `HAVING` on an aggregate alias now uses the aggregate itself, and the alias was removed from `GROUP BY`.
* BI3: `GROUP BY ?tagName ?countMonth1 ?countMonth2` is now `GROUP BY ?tagName`, and `?diff` is computed from the aggregates instead of their aliases.
* BI7: `GROUP BY ?personId ?message2 ?authorityScore` is now `GROUP BY ?personId`.
  The popularity score of `?person2` was grouped per like (always 1), and is now grouped per person, as in the query definition.
* BI9: `HAVING` on `?count1`/`?count2` now uses the aggregates.
* BI10: removed the aggregate alias `?friendsScore` from `GROUP BY`.

All other templates are unchanged.

## Parameters

Parameters are mapped to the columns of `bi_N_param.txt` by name, except for BI2, where `$startDate`/`$endDate` are taken from the `date1`/`date2` columns.
Dates are epoch milliseconds in the parameter files, and are instantiated as `xsd:dateTime`.
If a parameter file has fewer rows than `queryCount` (such as `bi_20_param.txt`, which always has 3 rows), its rows are repeated.
