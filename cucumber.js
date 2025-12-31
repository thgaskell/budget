module.exports = {
  default: {
    paths: ['cli/features/**/*.feature'],
    import: ['cli/features/steps/**/*.ts'],
    format: ['progress-bar', 'html:cucumber-report.html'],
  },
}
