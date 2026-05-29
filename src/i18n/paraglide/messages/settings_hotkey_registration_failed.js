/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ combo: NonNullable<unknown> }} Settings_Hotkey_Registration_FailedInputs */

const uk_settings_hotkey_registration_failed = /** @type {(inputs: Settings_Hotkey_Registration_FailedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Не вдалося зареєструвати хоткей ${i?.combo}`)
};

const en_settings_hotkey_registration_failed = /** @type {(inputs: Settings_Hotkey_Registration_FailedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Failed to register hotkey ${i?.combo}`)
};

/**
* | output |
* | --- |
* | "Failed to register hotkey {combo}" |
*
* @param {Settings_Hotkey_Registration_FailedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_registration_failed = /** @type {((inputs: Settings_Hotkey_Registration_FailedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_Registration_FailedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_registration_failed(inputs)
	return en_settings_hotkey_registration_failed(inputs)
});