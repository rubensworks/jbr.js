# Changelog
All notable changes to this project will be documented in this file.

<a name="v2.0.2"></a>
## [v2.0.2](https://github.com/rubensworks/jbr.js/compare/v2.0.1...v2.0.2) - 2022-07-25

### Fixed
* [Fix combinations-based init failing in standalone experiments](https://github.com/rubensworks/jbr.js/commit/796609ca2f347496196f04839424f6e3bc2f712a)
* [Fix incorrect default experiment iri](https://github.com/rubensworks/jbr.js/commit/54ec13fb2b889651b9b39e42ed0dd13c81de30e8)

<a name="v2.0.1"></a>
## [v2.0.1](https://github.com/rubensworks/jbr.js/compare/v2.0.0...v2.0.1) - 2022-07-19

### Fixed
* [Fix dependency version issues introducing during major bump](https://github.com/rubensworks/jbr.js/commit/4e525009e7103a0f5727912696a9280a3754bae1)

<a name="v2.0.0"></a>
## [v2.0.0](https://github.com/rubensworks/jbr.js/compare/v1.0.2...v2.0.0) - 2022-07-19

### Added
* [Allow running just a single combination](https://github.com/rubensworks/jbr.js/commit/61f9389a0da7992bed29039e6e9f119bf1cb83f1)
* [Allow URL params to be passed to query runners](https://github.com/rubensworks/jbr.js/commit/b5f073c86ef738e103a39fed18748d1aa581db7c)

### Changed
* [Rename ldbc-snb-decentralized to solidbench](https://github.com/rubensworks/jbr.js/commit/b71e4e48003e2dc5136ea3dac9c20c10505e6178)
* [Update to Components.js 5](https://github.com/rubensworks/jbr.js/commit/9230cfa90b85a169131f557604d7c0311693661b)
* [Update dependency comunica/query-sparql to v2.3.0](https://github.com/rubensworks/jbr.js/commit/6f78f42521cd1d84b57cb94ad7d0dc80614ac47b)
* [Add termination handler to close experiments on early process close](https://github.com/rubensworks/jbr.js/commit/67249ca3ce38aa6e9131a08c33012a322e16aec4)
* [Abstract securing of process handlers](https://github.com/rubensworks/jbr.js/commit/cee5ece990356c6283aeb887daa722db69abd6ff)
* [Make sure all combinations have different @id values](https://github.com/rubensworks/jbr.js/commit/b3c5425f3fc0683070fd9450a1bda153722741f6)
* [Update to sparql-benchmark-runner 2.5.0](https://github.com/rubensworks/jbr.js/commit/f2ffcc8136f07f05b08d63e003086693f633743f)
* [Count intermediary query result before error occurs](https://github.com/rubensworks/jbr.js/commit/fc2b987a6408e79681a5c0a3b779e48cde83608d)
* Changes to solidbench
    * [Bump sparql-benchmark-runner to output errored queries](https://github.com/rubensworks/jbr.js/commit/fc91acb8c901c6860419c29968671c57f84ea740)
    * [Fix server URL not being applied to template queries in LDBC SNB D](https://github.com/rubensworks/jbr.js/commit/b1e541a8f759860e57dea917df5839e0cc628978)
    * [Configure proper up-check query for LDBC-SNB-D](https://github.com/rubensworks/jbr.js/commit/928259f5c72bf277bf42fa2f3df5aaf4a2d97594)
    * [Fix networks in LDBC SNB D not being removed correctly](https://github.com/rubensworks/jbr.js/commit/da79b1cb0bb4db8531e0dab20893202533307af8)
    * [Modify baseUrl for LDBC-SNB-D dataset](https://github.com/rubensworks/jbr.js/commit/3c55b995a91b0b9979ee881b9f9f02a37930bea5)
    * [Run LDBC SNB D experiment in Docker network](https://github.com/rubensworks/jbr.js/commit/62da5ef6890110b0a10292319e9c2f346042f4fa)
    * [Emit warning when running LDBC without enough memory](https://github.com/rubensworks/jbr.js/commit/f23216b79575928f0e6318c2a2d0650f44183f1a)
    * [Pass configs as absolute paths to ldbc-snb-d](https://github.com/rubensworks/jbr.js/commit/b35c15282f78565130046ec64afbe44ece4cfd5d)

### Fixed
* [Fix broken Docker CPU measuring](https://github.com/rubensworks/jbr.js/commit/e5079dda8465e710caa9202832703aead080429f)

<a name="v1.0.2"></a>
## [v1.0.2](https://github.com/rubensworks/jbr.js/compare/v1.0.1...v1.0.2) - 2021-08-13

### Fixed
* [Fix mainModulePath being invalid when globally install](https://github.com/rubensworks/jbr.js/commit/366949199b3c74b18476cb681aa36f558c204b20)

<a name="v1.0.1"></a>
## [v1.0.1](https://github.com/rubensworks/jbr.js/compare/v1.0.0...v1.0.1) - 2021-08-13

### Fixed
* [Fix .gitignore not being available in template files](https://github.com/rubensworks/jbr.js/commit/6c7f47d4450fdf8bbe48b830db543bffb704f59d)

<a name="v1.0.0"></a>
## [v1.0.0] - 2021-04-13

Initial release
