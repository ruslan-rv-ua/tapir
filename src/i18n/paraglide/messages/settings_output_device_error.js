/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Output_Device_ErrorInputs */

const uk_settings_output_device_error = /** @type {(inputs: Settings_Output_Device_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Не вдалося змінити пристрій виведення`)
};

const en_settings_output_device_error = /** @type {(inputs: Settings_Output_Device_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Failed to change output device`)
};

/**
* | output |
* | --- |
* | "Failed to change output device" |
*
* @param {Settings_Output_Device_ErrorInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_output_device_error = /** @type {((inputs?: Settings_Output_Device_ErrorInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Output_Device_ErrorInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_output_device_error(inputs)
	return en_settings_output_device_error(inputs)
});