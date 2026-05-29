/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Output_Device_RefreshInputs */

const uk_settings_output_device_refresh = /** @type {(inputs: Settings_Output_Device_RefreshInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Оновити список пристроїв`)
};

const en_settings_output_device_refresh = /** @type {(inputs: Settings_Output_Device_RefreshInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Refresh device list`)
};

/**
* | output |
* | --- |
* | "Refresh device list" |
*
* @param {Settings_Output_Device_RefreshInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_output_device_refresh = /** @type {((inputs?: Settings_Output_Device_RefreshInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Output_Device_RefreshInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_output_device_refresh(inputs)
	return en_settings_output_device_refresh(inputs)
});