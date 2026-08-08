import type { FC, PropsWithChildren } from 'hono/jsx'

type TextInputProps = {
  id: string
  name: string
  label: string
  type?: 'text' | 'email' | 'password'
  value?: string
  placeholder?: string
  required?: boolean
  autocomplete?: string
  errors?: string[]
}

const TextInput: FC<PropsWithChildren<TextInputProps>> = (props) => {
  const { id, name, label, type = 'text', value, placeholder, required = false, autocomplete, errors } = props
  const hasErrors = errors != null && errors.length > 0
  return (
    <div className="text-input">
      <label htmlFor={id} className={hasErrors ? 'error' : undefined}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        autocomplete={autocomplete}
        aria-invalid={hasErrors ? 'true' : undefined}
        aria-describedby={hasErrors ? `${id}-errors` : undefined}
        className={hasErrors ? 'error' : undefined}
      />
      {hasErrors && (
        <ul id={`${id}-errors`} className="errors">
          {errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default TextInput
