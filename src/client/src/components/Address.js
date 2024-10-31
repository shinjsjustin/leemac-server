import React, { useState } from 'react';
import GooglePlacesAutocomplete from 'react-google-places-autocomplete';

const Address = ({onAddressSelect}) => {
    const [value, setValue] = useState(null);

    const onChange = (change) =>{
        setValue(change)
        onAddressSelect(change.label)
    }

    return (
        <div>
            <GooglePlacesAutocomplete
                apiKey="AIzaSyDNDOUBwLKaocSIRVK-QwGvjTTaB3mkUss"
                selectProps={{
                    value,
                    onChange: onChange,
                }}
            />
        </div>
    )
}
    


export default Address;