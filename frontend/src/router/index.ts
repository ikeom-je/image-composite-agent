import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Portal',
      component: () => import('../pages/PortalPage.vue'),
      meta: { title: 'Image Compositor - ポータル' }
    },
    {
      path: '/api',
      name: 'Api',
      component: () => import('../pages/ApiPage.vue'),
      meta: { title: '画像合成API - Image Compositor' }
    },
    {
      path: '/chat',
      name: 'Chat',
      component: () => import('../pages/ChatPage.vue'),
      meta: { title: 'チャットエージェント - Image Compositor' }
    },
    {
      path: '/chat/settings',
      name: 'ChatSettings',
      component: () => import('../pages/SettingsPage.vue'),
      meta: { title: 'Agent設定 - Image Compositor' }
    },
  ]
})

router.beforeEach((to, _from, next) => {
  if (to.meta?.title) {
    document.title = to.meta.title as string
  }
  next()
})

export default router
