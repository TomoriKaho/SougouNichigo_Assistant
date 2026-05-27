const target = process.env.VUE_APP_ADMIN_PROXY_TARGET || 'http://localhost:3000'

module.exports = {
  // 生产环境使用 /admin/，开发环境使用 /
  publicPath: process.env.NODE_ENV === 'production' ? '/admin/' : '/',
  // 禁用 thread-loader 并行编译，避免 Docker 构建时 worker 序列化 SFC 失败
  parallel: false,
  devServer: {
    proxy: {
      '/admin': {
        target,
        changeOrigin: true
      }
    }
  }
}
