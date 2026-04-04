'use client'

import { useState, useEffect } from 'react'
import loginStyles from '../login/login.module.css'
import Icon from '@/app/_components/icon'
import Input from '@/app/_components/input'
import Label from '@/app/_components/label'
import LinkButton from '@/app/_components/linkbutton'
import Button from '../_components/button'
import FormField from "@/app/_ui/formField"

export default function Signup() {
    // async function createUser(formData: FormData) {
    //     'use server'

    //     const rawFormData = {
    //         userEmail: formData.get('email'),
    //         userName: formData.get('username'),
    //         userPassw: formData.get('passw'),
    //     }

    //     console.log(rawFormData);
    // }

    // client-side form state + validation
    const [values, setValues] = useState({
        email: '',
        username: '',
        passw: '',
        passwconf: '',
    })

    const [errors, setErrors] = useState({
        email: { status: false, error: '' },
        username: { status: false, error: '' },
        passw: { status: false, error: '' },
        passwconf: { status: false, error: '' },
    })

    const [allowSubmit, setAllowSubmit] = useState(false);

    const inputChangeHandler = (e) => {
        setValues(prev => ({ ...prev, [e.target.name]: e.target.value }));

        if (e.target.value != '') {
            setErrors(prev => ({ ...prev, [e.target.name]: { status: false, error: '' } }));
        }

        if (values.email != '' && values.username != '' && values.passw != '' && values.passwconf != '') {
            setAllowSubmit(true);
        } else {
            setAllowSubmit(true);
        }
    }


    const handleFormSubmit = (e) => {
        e.preventDefault();

        if (values.email == '') {
            setErrors(prev => ({ ...prev, email: { status: true, error: 'Kötelező mező' } }));
        } else {
            setErrors(prev => ({ ...prev, email: { status: false, error: 'Kötelező mező' } }));
        }

        if (values.username == '') {
            setErrors(prev => ({ ...prev, username: { status: true, error: 'Kötelező mező' } }));
        } else {
            setErrors(prev => ({ ...prev, username: { status: false, error: 'Kötelező mező' } }));
        }

        if (values.passw == '') {
            setErrors(prev => ({ ...prev, passw: { status: true, error: 'Kötelező mező' } }));
        } else {
            setErrors(prev => ({ ...prev, passw: { status: false, error: 'Kötelező mező' } }));
        }

        if (values.passwconf == '') {
            setErrors(prev => ({ ...prev, passwconf: { status: true, error: 'Kötelező mező' } }));
        } else {
            setErrors(prev => ({ ...prev, passwconf: { status: false, error: 'Kötelező mező' } }));
        }
    }

    return (
        <div className={loginStyles.credentials}>
            <form className={loginStyles.form} onSubmit={handleFormSubmit}>
                <div>
                    <h1 className={loginStyles.title}>Regisztráció</h1>
                </div>
                <FormField
                    className={loginStyles.field}
                    type={"email"}
                    text={"Email"}
                    name={"email"}
                    onChange={inputChangeHandler}
                    error={errors.email.status}
                />
                <FormField
                    className={loginStyles.field}
                    type={"text"}
                    text={"Felhasználónév:"}
                    name={"username"}
                    onChange={inputChangeHandler}
                    error={errors.username.status}
                />

                <FormField
                    className={loginStyles.field}
                    type={"password"}
                    text={"Jelszó:"}
                    name={"passw"}
                    onChange={inputChangeHandler}
                    error={errors.passw.status}
                />
                <FormField
                    className={loginStyles.field}
                    type={"password"}
                    text={"Jelszó újra:"}
                    name={"passwconf"}
                    onChange={inputChangeHandler}
                    error={errors.passwconf.status}
                />


                <div className={loginStyles.btns}>
                    <Button
                        type="submit"
                        text='REGISZTRÁCIÓ'
                        disabled={!allowSubmit}
                    >
                        <Icon src='./registration.svg' alt='registration icon' />
                    </Button>
                    <LinkButton
                        href='/login'
                        type="button"
                        text='BELÉPÉS'
                    >
                        <Icon src='./login.svg' alt='login icon' />
                    </LinkButton>

                </div>
            </form>
        </div>
    )
}