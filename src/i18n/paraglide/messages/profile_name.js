/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_NameInputs */

const uk_profile_name = /** @type {(inputs: Profile_NameInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Профіль`)
};

const en_profile_name = /** @type {(inputs: Profile_NameInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Profile`)
};

/**
* | output |
* | --- |
* | "Profile" |
*
* @param {Profile_NameInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_name = /** @type {((inputs?: Profile_NameInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_NameInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_name(inputs)
	return en_profile_name(inputs)
});