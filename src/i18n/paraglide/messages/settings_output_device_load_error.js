/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Output_Device_Load_ErrorInputs */

const uk_settings_output_device_load_error = /** @type {(inputs: Settings_Output_Device_Load_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Не вдалося завантажити список пристроїв`)
};

const en_settings_output_device_load_error = /** @type {(inputs: Settings_Output_Device_Load_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Failed to load device list`)
};

/**
* | output |
* | --- |
* | "Failed to load device list" |
*
* @param {Settings_Output_Device_Load_ErrorInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_output_device_load_error = /** @type {((inputs?: Settings_Output_Device_Load_ErrorInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Output_Device_Load_ErrorInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_output_device_load_error(inputs)
	return en_settings_output_device_load_error(inputs)
});