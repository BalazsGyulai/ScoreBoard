import loginStyles from './login.module.css'
import Icon from '@/app/_components/icon'
import Input from '@/app/_components/input'
import Label from '@/app/_components/label'
import LinkButton from '@/app/_components/linkbutton'

export default function Login() {

    return (
        <div className={loginStyles.credentials}>
            <form className={loginStyles.form}>
                <div>
                    <h1 className={loginStyles.title}>Belépés</h1>
                </div>
                <div className={loginStyles.field}>
                    <Label htmlFor="email" text='Email:'/>
                    <Input
                        type="text"
                        name="email"
                        // value={username}
                        // onChange={nameChangeHandler}
                        required={true}
                    />
                </div>
                <div className={loginStyles.field}>
                    <Label htmlFor='passw' text='Jelszó:'/>
                    <Input
                        type="password"
                        name="passw"
                        // value={username}
                        // onChange={nameChangeHandler}
                        required={true}
                    />
                </div>

                <div className={loginStyles.btns}>
                    <LinkButton
                        href='/signup'
                        type="button"
                        text='REGISZTRÁCIÓ'
                    >
                        <Icon src='./registration.svg' alt='registration icon' />
                    </LinkButton>
                    <LinkButton
                        href='/login'
                        type="submit"
                        text='BELÉPÉS'
                        disabled={true}
                    >
                        <Icon src='./login.svg' alt='login icon' />
                    </LinkButton>

                </div>
            </form>
        </div>
    )
}