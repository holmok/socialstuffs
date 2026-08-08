import type { FC, PropsWithChildren } from 'hono/jsx'

type TextInputProps = {
  id: string
  name: string
  label: string
  type?: 'text' | 'email' | 'password'
  value?: string
  placeholder?: string
  required?: boolean
  errors?: string[]
}

const TextInput: FC<PropsWithChildren<TextInputProps>> = (props) => {
  const { id, name, label, type = 'text', value, placeholder, required = false, errors } = props
  return (
    <div className="text-input">
      <label htmlFor={id} className={errors && errors.length > 0 ? 'error' : undefined}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        className={errors && errors.length > 0 ? 'error' : undefined}
      />
      {errors && errors.length > 0 && (
        <ul className="errors">
          {errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default TextInput
