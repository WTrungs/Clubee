/** Bật mock MSW: theo VITE_USE_MOCK nếu có, mặc định bật khi chạy dev và tắt khi build production. */
export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK ? import.meta.env.VITE_USE_MOCK === 'true' : import.meta.env.DEV
