/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_New_Name_LabelInputs */

const uk_profile_new_name_label = /** @type {(inputs: Profile_New_Name_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Нова назва`)
};

const en_profile_new_name_label = /** @type {(inputs: Profile_New_Name_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`New name`)
};

/**
* | output |
* | --- |
* | "New name" |
*
* @param {Profile_New_Name_LabelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_new_name_label = /** @type {((inputs?: Profile_New_Name_LabelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_New_Name_LabelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_new_name_label(inputs)
	return en_profile_new_name_label(inputs)
});