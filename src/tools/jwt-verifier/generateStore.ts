import { ref } from 'vue'
import { defineStore } from 'pinia'

export const JWT_GENERATE_DEFAULT_HEADER = '{\n  "alg": "HS256",\n  "typ": "JWT"\n}'
export const JWT_GENERATE_DEFAULT_PAYLOAD = '{\n  "sub": "user-1"\n}'

/**
 * E2 生成视图的页面内存级状态（规格约定：Pinia——站内导航保留、刷新即清）。
 * secret 与生成结果只存在于内存中，绝不写入 localStorage / sessionStorage。
 */
export const useJwtGenerateStore = defineStore('jwt-generate', () => {
  const headerText = ref(JWT_GENERATE_DEFAULT_HEADER)
  const payloadText = ref(JWT_GENERATE_DEFAULT_PAYLOAD)
  const secret = ref('')
  const token = ref('')

  function reset() {
    headerText.value = JWT_GENERATE_DEFAULT_HEADER
    payloadText.value = JWT_GENERATE_DEFAULT_PAYLOAD
    secret.value = ''
    token.value = ''
  }

  return { headerText, payloadText, secret, token, reset }
})
