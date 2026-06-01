/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_List_LabelInputs */

const uk_profile_list_label = /** @type {(inputs: Profile_List_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Профілі`)
};

const en_profile_list_label = /** @type {(inputs: Profile_List_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Profiles`)
};

/**
* | output |
* | --- |
* | "Profiles" |
*
* @param {Profile_List_LabelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_list_label = /** @type {((inputs?: Profile_List_LabelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_List_LabelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_list_label(inputs)
	return en_profile_list_label(inputs)
});