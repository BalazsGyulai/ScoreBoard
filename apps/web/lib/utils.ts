// accepts any character
// /prop setter
//       holds the useState value so it can call its setter
export const handleStringChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => setter(e.target.value)

