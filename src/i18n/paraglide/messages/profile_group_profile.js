/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_Group_ProfileInputs */

const uk_profile_group_profile = /** @type {(inputs: Profile_Group_ProfileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Профіль`)
};

const en_profile_group_profile = /** @type {(inputs: Profile_Group_ProfileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Profile`)
};

/**
* | output |
* | --- |
* | "Profile" |
*
* @param {Profile_Group_ProfileInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_group_profile = /** @type {((inputs?: Profile_Group_ProfileInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Group_ProfileInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_group_profile(inputs)
	return en_profile_group_profile(inputs)
});