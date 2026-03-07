<template>
  <div class="max-w-4xl mx-auto px-4 py-12">
    <div class="text-center mb-10">
      <h1 class="text-3xl font-bold text-gray-900 mb-3">Image Compositor</h1>
      <p class="text-gray-600">画像合成REST API &amp; チャットエージェント</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- API確認ページカード -->
      <router-link to="/api" class="group block">
        <div class="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border border-gray-100 group-hover:-translate-y-1">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 class="text-xl font-semibold text-gray-900">API確認ページ</h2>
          </div>
          <p class="text-gray-600 text-sm mb-4">
            画像合成APIのパラメータを直接設定して実行。最大3枚の画像合成、動画生成、S3アップロードに対応。
          </p>
          <span class="inline-flex items-center text-blue-600 text-sm font-medium">
            APIDemo タブへ →
          </span>
        </div>
      </router-link>

      <!-- チャットエージェントカード -->
      <router-link to="/chat" class="group block">
        <div class="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border border-gray-100 group-hover:-translate-y-1">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h2 class="text-xl font-semibold text-gray-900">チャットエージェント</h2>
          </div>
          <p class="text-gray-600 text-sm mb-4">
            対話形式で画像合成を実行。コマンドで合成パラメータを設定し、結果をチャット内でプレビュー。
          </p>
          <span class="inline-flex items-center text-indigo-600 text-sm font-medium">
            ChatAgent タブへ →
          </span>
        </div>
      </router-link>
    </div>
  </div>
</template>
