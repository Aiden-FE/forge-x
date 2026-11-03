import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { JwtSignAlgorithm } from './jwt'

export const JWT_GENERATE_DEFAULT_HEADER = '{\n  "alg": "HS256",\n  "typ": "JWT"\n}'
export const JWT_GENERATE_DEFAULT_PAYLOAD = '{\n  "sub": "user-1"\n}'

/**
 * E2 生成视图的页面内存级状态（规格约定：Pinia——站内导航保留、刷新即清）。
 * secret、PEM 私钥与生成结果只存在于内存中，绝不写入 localStorage / sessionStorage
 * （13 票：私钥仅内存级声明延续 v0.3.0 HS256 secret 先例）。
 */
export const useJwtGenerateStore = defineStore('jwt-generate', () => {
  const headerText = ref(JWT_GENERATE_DEFAULT_HEADER)
  const payloadText = ref(JWT_GENERATE_DEFAULT_PAYLOAD)
  const algorithm = ref<JwtSignAlgorithm>('HS256')
  const secret = ref('')
  const privateKeyPem = ref('')
  const token = ref('')

  function reset() {
    headerText.value = JWT_GENERATE_DEFAULT_HEADER
    payloadText.value = JWT_GENERATE_DEFAULT_PAYLOAD
    algorithm.value = 'HS256'
    secret.value = ''
    privateKeyPem.value = ''
    token.value = ''
  }

  return { headerText, payloadText, algorithm, secret, privateKeyPem, token, reset }
})
