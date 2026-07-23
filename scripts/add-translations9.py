# Batch 9: home-header account button (Google sign-in entry point).
import os
LANGS = ['fr','es','tr','de','it','pt','nl','pl','ru','ja','ko','zh']
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'locales')
KEYS = {
  'Sign in': ['Se connecter','Iniciar sesión','Giriş yap','Anmelden','Accedi','Entrar','Inloggen','Zaloguj się','Войти','ログイン','로그인','登录'],
  'Plans and Pro access sync across your signed-in Android devices.': [
    'Vos plans et l’accès Pro se synchronisent sur vos appareils Android connectés.',
    'Tus planos y el acceso Pro se sincronizan en tus dispositivos Android con sesión iniciada.',
    'Planlarınız ve Pro erişimi, oturum açtığınız Android cihazlar arasında senkronize olur.',
    'Deine Pläne und der Pro-Zugang werden auf deinen angemeldeten Android-Geräten synchronisiert.',
    'I tuoi progetti e l’accesso Pro si sincronizzano sui tuoi dispositivi Android con l’accesso effettuato.',
    'Seus projetos e o acesso Pro sincronizam entre seus dispositivos Android conectados.',
    'Je plannen en Pro-toegang synchroniseren op je aangemelde Android-apparaten.',
    'Twoje plany i dostęp Pro synchronizują się na zalogowanych urządzeniach z Androidem.',
    'Ваши планы и доступ Pro синхронизируются на устройствах Android с выполненным входом.',
    'ログイン中の Android 端末間でプランと Pro アクセスが同期されます。',
    '로그인한 Android 기기 간에 도면과 Pro 이용 권한이 동기화됩니다.',
    '您的方案和 Pro 权限会在已登录的 Android 设备间同步。',
  ],
}
for i, lang in enumerate(LANGS):
    path = os.path.join(ROOT, f'{lang}.ts')
    src = open(path, encoding='utf-8').read()
    added = 0
    for key, vals in KEYS.items():
        assert len(vals) == 12, key
        qkey = key.replace("'", "\\'")
        if f"'{qkey}':" in src or f'"{key}":' in src:
            continue
        qval = vals[i].replace("'", "\\'")
        idx = src.rstrip().rfind('};')
        src = src[:idx] + f"  '{qkey}': '{qval}',\n}};" + src.rstrip()[idx+2:] + '\n'
        added += 1
    open(path, 'w', encoding='utf-8').write(src)
    print(lang, added)
print('batch9 done')
