import { LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui'

export default function SettingsLogoutAction({ onClick, disabled = false }: {
  onClick: () => void
  disabled?: boolean
}) {
  const { t } = useTranslation()

  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      fullWidth
      onClick={onClick}
      disabled={disabled}
      icon={<LogOut size={16} aria-hidden="true" />}
      className="motion-reduce:transition-none lg:justify-start lg:px-3 lg:text-sm"
    >
      {t('common.logout')}
    </Button>
  )
}
