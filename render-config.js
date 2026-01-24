// Render platform optimization settings

const renderConfig = {
    optimize: true,
    minify: true,
    caching: {
        enabled: true,
        duration: '7d',
    },
    performance: {
        lazyLoad: true,
        codeSplitting: true,
    },
};

module.exports = renderConfig;