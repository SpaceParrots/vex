# Changelog

## [0.2.0](https://github.com/SpaceParrots/vex/compare/v0.1.1...v0.2.0) (2026-06-24)


### Features

* **env:** add env param to all execution tools via envAwareTool ([8a747c7](https://github.com/SpaceParrots/vex/commit/8a747c7c282c3a1f069be2c38b5f225932218faf))
* **env:** add global --env flag to the CLI ([c1629d4](https://github.com/SpaceParrots/vex/commit/c1629d4a5481e86e75d92bbbf1591682dc8e4c85))
* **env:** add per-call env-context resolver with precedence chain ([2c24151](https://github.com/SpaceParrots/vex/commit/2c2415165e9b478a37f9bf89479970d7b00f7a34))
* **env:** add vex_current_env tool and 'vex env current' command ([0655346](https://github.com/SpaceParrots/vex/commit/06553460e5939ad9cd3b546895ca4ce229467ffa))
* **env:** per-call environment targeting + visibility ([e1109b5](https://github.com/SpaceParrots/vex/commit/e1109b54c329606bc01eac7f0701b6e385461988))
* **env:** per-call environment targeting and visibility tool ([e1109b5](https://github.com/SpaceParrots/vex/commit/e1109b54c329606bc01eac7f0701b6e385461988))
* **env:** resolve getClient through env-context ([42a5ce3](https://github.com/SpaceParrots/vex/commit/42a5ce3383ee9feb2704fb86b2d5a80a21bec3d1))


### Bug Fixes

* **env:** consistent not-found errors with available list; env current surfaces real errors ([c28fb09](https://github.com/SpaceParrots/vex/commit/c28fb09946f0245ec7d6345b1b751949b1fd1b58))
* **mcp:** escape backticks in env-targeting server instructions ([a53b5c9](https://github.com/SpaceParrots/vex/commit/a53b5c91bffcfb622fa07eb13b7cb2cdeecaf5bc))
* **release:** keep v-prefixed tags without component name ([#21](https://github.com/SpaceParrots/vex/issues/21)) ([d076bfb](https://github.com/SpaceParrots/vex/commit/d076bfbbc1c460a946adab1c474ce487eae6de82))
