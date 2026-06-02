/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_Invalid_Name_ErrorInputs */

const uk_profile_invalid_name_error = /** @type {(inputs: Profile_Invalid_Name_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Недопустима назва профілю`)
};

const en_profile_invalid_name_error = /** @type {(inputs: Profile_Invalid_Name_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Invalid profile name`)
};

/**
* | output |
* | --- |
* | "Invalid profile name" |
*
* @param {Profile_Invalid_Name_ErrorInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_invalid_name_error = /** @type {((inputs?: Profile_Invalid_Name_ErrorInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Invalid_Name_ErrorInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_invalid_name_error(inputs)
	return en_profile_invalid_name_error(inputs)
});