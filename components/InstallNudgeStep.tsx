'use client'
import { useRouter } from 'next/navigation'
import { OnboardingStep } from '@/components/OnboardingStep'
import { IosInstallIllustration } from '@/components/IosInstallIllustration'
import { AndroidInstallIllustration } from '@/components/AndroidInstallIllustration'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { useTranslation } from '@/components/LanguageProvider'

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua)
}

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /android/i.test(navigator.userAgent)
}

export function InstallNudgeStep() {
  const { t } = useTranslation()
  const router = useRouter()
  const { prompt, isSupported } = useInstallPrompt()
  const ios = isIosSafari()

  // Use UA to pick the illustration; isSupported gates whether the CTA can
  // trigger the native prompt (beforeinstallprompt fires asynchronously and
  // may not have arrived yet when the component first renders).
  const showAndroid = isAndroid() && !ios

  async function handleInstall() {
    if (showAndroid && isSupported) {
      await prompt()
    }
    localStorage.setItem('cc:install-dismissed', '1')
    router.push('/?welcome=true')
  }

  function handleSkip() {
    localStorage.setItem('cc:install-dismissed', '1')
    router.push('/?welcome=true')
  }

  const ctaLabel = showAndroid && isSupported
    ? t('onboarding.install.ctaInstall')
    : t('onboarding.install.ctaGotIt')

  const illustration = showAndroid ? (
    <AndroidInstallIllustration ariaLabel={t('onboarding.install.androidAriaLabel')} />
  ) : (
    <IosInstallIllustration ariaLabel={t('onboarding.install.iosAriaLabel')} />
  )

  return (
    <div className="flex h-full flex-col gap-6">
      <OnboardingStep
        step={1}
        totalSteps={1}
        illustration={illustration}
        heading={t('onboarding.install.heading')}
        body={t('onboarding.install.body')}
        ctaLabel={ctaLabel}
        onNext={handleInstall}
        stepOfTotalLabel={t('onboarding.stepOfTotal', { n: 1, total: 1 })}
      />
      <button
        type="button"
        onClick={handleSkip}
        className="w-full flex-shrink-0 py-3 text-sm text-text-tertiary hover:text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 rounded-xl"
      >
        {t('onboarding.install.skip')}
      </button>
    </div>
  )
}
