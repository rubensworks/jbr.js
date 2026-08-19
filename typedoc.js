const { getPackagesSync } = require('@lerna/project')
const path = require('path')

module.exports = {
    name: 'jbr',
    out: 'documentation',
    entryPointStrategy: 'packages',
    entryPoints: getPackagesSync(path.join(__dirname, 'packages')).map(
        pkg => path.relative(__dirname, pkg.location)
    ),
    excludeExternals: false,
}
