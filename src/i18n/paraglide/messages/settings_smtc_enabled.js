/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Smtc_EnabledInputs */

const uk_settings_smtc_enabled = /** @type {(inputs: Settings_Smtc_EnabledInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Інтеграція з системними медіа-кнопками`)
};

const en_settings_smtc_enabled = /** @type {(inputs: Settings_Smtc_EnabledInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`System media keys integration`)
};

/**
* | output |
* | --- |
* | "System media keys integration" |
*
* @param {Settings_Smtc_EnabledInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_smtc_enabled = /** @type {((inputs?: Settings_Smtc_EnabledInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Smtc_EnabledInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_smtc_enabled(inputs)
	return en_settings_smtc_enabled(inputs)
});