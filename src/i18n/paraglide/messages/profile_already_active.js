/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_Already_ActiveInputs */

const uk_profile_already_active = /** @type {(inputs: Profile_Already_ActiveInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Профіль уже активний`)
};

const en_profile_already_active = /** @type {(inputs: Profile_Already_ActiveInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Profile is already active`)
};

/**
* | output |
* | --- |
* | "Profile is already active" |
*
* @param {Profile_Already_ActiveInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_already_active = /** @type {((inputs?: Profile_Already_ActiveInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Already_ActiveInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_already_active(inputs)
	return en_profile_already_active(inputs)
});